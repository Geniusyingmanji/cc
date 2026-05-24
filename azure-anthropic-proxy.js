// azure-anthropic-proxy.js
// Accepts Anthropic Messages API requests and translates to Azure OpenAI Chat Completions API.
// Usage: AZURE_ENDPOINT=... AZURE_API_KEY=... AZURE_API_VERSION=... node azure-anthropic-proxy.js

const http = require("http");
const https = require("https");
const { URL } = require("url");

const LISTEN_PORT = parseInt(process.env.PROXY_PORT || "18900");
const AZURE_ENDPOINT = process.env.AZURE_ENDPOINT; // e.g. https://xxx.cognitiveservices.azure.com/openai/deployments/gpt-5.4
const AZURE_API_KEY = process.env.AZURE_API_KEY;
const AZURE_API_VERSION = process.env.AZURE_API_VERSION || "2024-12-01-preview";
const CLASH_PROXY = process.env.CLASH_PROXY || "";
const MODEL_NAME = process.env.MODEL_NAME || "claude-sonnet-4-6"; // model name to report back

const proxyUrl = CLASH_PROXY ? new URL(CLASH_PROXY) : null;
const azureUrl = new URL(AZURE_ENDPOINT);
const proxyAuth = proxyUrl && proxyUrl.username ? "Basic " + Buffer.from(proxyUrl.username + ":" + (proxyUrl.password || "")).toString("base64") : null;

// --- Anthropic -> OpenAI translation ---

function translateRequest(anthropicBody) {
  const oai = {};
  const messages = [];

  // System message
  if (anthropicBody.system) {
    const sys = typeof anthropicBody.system === "string"
      ? anthropicBody.system
      : anthropicBody.system.map(b => b.text || "").join("\n");
    messages.push({ role: "system", content: sys });
  }

  // Messages
  for (const msg of anthropicBody.messages || []) {
    if (msg.role === "assistant") {
      const oaiMsg = { role: "assistant" };
      if (typeof msg.content === "string") {
        oaiMsg.content = msg.content;
      } else if (Array.isArray(msg.content)) {
        const textParts = [];
        const toolCalls = [];
        for (const block of msg.content) {
          if (block.type === "text") textParts.push(block.text);
          else if (block.type === "thinking") textParts.push(block.thinking);
          else if (block.type === "tool_use") {
            toolCalls.push({
              id: block.id,
              type: "function",
              function: { name: block.name, arguments: JSON.stringify(block.input) },
            });
          }
        }
        oaiMsg.content = textParts.join("") || null;
        if (toolCalls.length > 0) oaiMsg.tool_calls = toolCalls;
      }
      messages.push(oaiMsg);
    } else if (msg.role === "user") {
      if (typeof msg.content === "string") {
        messages.push({ role: "user", content: msg.content });
      } else if (Array.isArray(msg.content)) {
        // Check for tool_result blocks
        let hasToolResult = false;
        for (const block of msg.content) {
          if (block.type === "tool_result") {
            hasToolResult = true;
            const resultContent = typeof block.content === "string"
              ? block.content
              : Array.isArray(block.content)
                ? block.content.map(b => b.text || "").join("")
                : JSON.stringify(block.content);
            messages.push({
              role: "tool",
              tool_call_id: block.tool_use_id,
              content: block.is_error ? `Error: ${resultContent}` : resultContent,
            });
          }
        }
        if (!hasToolResult) {
          // Regular user content blocks (text, image)
          const parts = [];
          for (const block of msg.content) {
            if (block.type === "text") {
              parts.push({ type: "text", text: block.text });
            } else if (block.type === "image") {
              parts.push({
                type: "image_url",
                image_url: {
                  url: block.source.type === "base64"
                    ? `data:${block.source.media_type};base64,${block.source.data}`
                    : block.source.url,
                },
              });
            }
          }
          messages.push({ role: "user", content: parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts });
        }
      }
    }
  }

  oai.messages = messages;

  // Parameters
  if (anthropicBody.max_tokens) oai.max_completion_tokens = anthropicBody.max_tokens;
  if (anthropicBody.temperature !== undefined) oai.temperature = anthropicBody.temperature;
  if (anthropicBody.top_p !== undefined) oai.top_p = anthropicBody.top_p;
  if (anthropicBody.stop_sequences) oai.stop = anthropicBody.stop_sequences;
  if (anthropicBody.stream) oai.stream = true;
  if (anthropicBody.stream && anthropicBody.stream !== false) oai.stream_options = { include_usage: true };

  // Tools
  if (anthropicBody.tools && anthropicBody.tools.length > 0) {
    oai.tools = anthropicBody.tools.map(t => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description || "",
        parameters: t.input_schema || { type: "object", properties: {} },
      },
    }));
  }

  return oai;
}

// --- OpenAI -> Anthropic response translation (non-streaming) ---

function translateResponse(oaiResp, reqModel) {
  const choice = oaiResp.choices && oaiResp.choices[0];
  if (!choice) {
    return { type: "error", error: { type: "api_error", message: "No choices in response" } };
  }

  const content = [];
  if (choice.message.content) {
    content.push({ type: "text", text: choice.message.content });
  }
  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let input;
      try { input = JSON.parse(tc.function.arguments); } catch { input = {}; }
      content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
    }
  }
  if (content.length === 0) content.push({ type: "text", text: "" });

  const stopMap = { stop: "end_turn", length: "max_tokens", tool_calls: "tool_use", content_filter: "end_turn" };

  return {
    id: `msg_${oaiResp.id || Date.now()}`,
    type: "message",
    role: "assistant",
    content,
    model: reqModel || MODEL_NAME,
    stop_reason: stopMap[choice.finish_reason] || "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: oaiResp.usage?.prompt_tokens || 0,
      output_tokens: oaiResp.usage?.completion_tokens || 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

// --- Streaming translation ---

function createStreamTranslator(res, reqModel) {
  let msgId = `msg_${Date.now()}`;
  let started = false;
  let contentStarted = false;
  let toolCalls = {}; // id -> {name, arguments}
  let inputTokens = 0;
  let outputTokens = 0;
  let buffer = "";

  function send(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  function ensureStarted() {
    if (!started) {
      started = true;
      send("message_start", {
        type: "message_start",
        message: {
          id: msgId, type: "message", role: "assistant", content: [],
          model: reqModel || MODEL_NAME, stop_reason: null, stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      });
    }
  }

  function ensureContentStarted() {
    if (!contentStarted) {
      contentStarted = true;
      send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    }
  }

  return {
    processLine(line) {
      if (!line.startsWith("data: ")) return;
      const data = line.slice(6).trim();
      if (data === "[DONE]") {
        // Finalize any open tool calls
        const toolIds = Object.keys(toolCalls);
        if (toolIds.length > 0) {
          // Close each tool call content block
          for (const id of toolIds) {
            const tc = toolCalls[id];
            let input;
            try { input = JSON.parse(tc.arguments); } catch { input = {}; }
            send("content_block_stop", { type: "content_block_stop", index: tc.index });
          }
        } else if (contentStarted) {
          send("content_block_stop", { type: "content_block_stop", index: 0 });
        }
        send("message_delta", {
          type: "message_delta",
          delta: { stop_reason: toolIds.length > 0 ? "tool_use" : "end_turn", stop_sequence: null },
          usage: { output_tokens: outputTokens },
        });
        send("message_stop", { type: "message_stop" });
        return "done";
      }

      let chunk;
      try { chunk = JSON.parse(data); } catch { return; }

      if (chunk.id) msgId = `msg_${chunk.id}`;

      // Usage from stream_options
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens || inputTokens;
        outputTokens = chunk.usage.completion_tokens || outputTokens;
      }

      const choice = chunk.choices && chunk.choices[0];
      if (!choice) return;

      ensureStarted();

      const delta = choice.delta || {};

      // Text content
      if (delta.content) {
        ensureContentStarted();
        send("content_block_delta", {
          type: "content_block_delta", index: 0,
          delta: { type: "text_delta", text: delta.content },
        });
      }

      // Tool calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const tcIdx = tc.index;
          if (tc.id) {
            // New tool call - close text block if open, start tool block
            if (contentStarted && Object.keys(toolCalls).length === 0) {
              send("content_block_stop", { type: "content_block_stop", index: 0 });
            }
            const blockIndex = (contentStarted ? 1 : 0) + Object.keys(toolCalls).length;
            toolCalls[tc.id] = { name: tc.function?.name || "", arguments: tc.function?.arguments || "", index: blockIndex };
            send("content_block_start", {
              type: "content_block_start", index: blockIndex,
              content_block: { type: "tool_use", id: tc.id, name: tc.function?.name || "" },
            });
          } else if (tc.function?.arguments) {
            // Continuing tool call arguments
            const existingIds = Object.keys(toolCalls);
            const id = existingIds[tcIdx] || existingIds[existingIds.length - 1];
            if (id && toolCalls[id]) {
              toolCalls[id].arguments += tc.function.arguments;
              send("content_block_delta", {
                type: "content_block_delta", index: toolCalls[id].index,
                delta: { type: "input_json_delta", partial_json: tc.function.arguments },
              });
            }
          }
        }
      }

      // Finish reason
      if (choice.finish_reason) {
        const stopMap = { stop: "end_turn", length: "max_tokens", tool_calls: "tool_use", content_filter: "end_turn" };
        // We'll send the final events in [DONE] handler
      }
    },

    error(msg) {
      ensureStarted();
      send("error", { type: "error", error: { type: "api_error", message: msg } });
    },
  };
}

// --- Azure HTTPS request via Clash proxy ---

function azureRequest(oaiBody, onResponse) {
  const targetPath = `${azureUrl.pathname}/chat/completions?api-version=${AZURE_API_VERSION}`;
  const bodyStr = JSON.stringify(oaiBody);

  // Direct mode when no proxy configured
  if (!proxyUrl) {
    const req = https.request({
      hostname: azureUrl.hostname, port: 443, path: targetPath, method: "POST",
      headers: { "Content-Type": "application/json", "api-key": AZURE_API_KEY, "Content-Length": Buffer.byteLength(bodyStr) },
    }, (azureRes) => { onResponse(azureRes, null); });
    req.on("error", (e) => onResponse(null, e.message));
    req.write(bodyStr);
    req.end();
    return;
  }


  const proxyReq = http.request({
    hostname: proxyUrl.hostname,
    port: proxyUrl.port,
    method: "CONNECT",
    path: `${azureUrl.hostname}:443`,
    headers: proxyAuth ? { "Proxy-Authorization": proxyAuth } : {},
  });

  proxyReq.on("connect", (proxyRes, socket) => {
    if (proxyRes.statusCode !== 200) {
      onResponse(null, `Proxy CONNECT failed: ${proxyRes.statusCode}`);
      socket.destroy();
      return;
    }

    const req = https.request({
      hostname: azureUrl.hostname,
      port: 443,
      path: targetPath,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": AZURE_API_KEY,
        "Content-Length": Buffer.byteLength(bodyStr),
      },
      socket,
      agent: false,
    }, (azureRes) => {
      onResponse(azureRes, null);
    });

    req.on("error", (e) => onResponse(null, e.message));
    req.write(bodyStr);
    req.end();
  });

  proxyReq.on("error", (e) => onResponse(null, `Proxy error: ${e.message}`));
  proxyReq.end();
}

// --- Handle /v1/messages ---

function handleMessages(req, res) {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let anthropicBody;
    try { anthropicBody = JSON.parse(body); } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Invalid JSON" } }));
      return;
    }

    const reqModel = anthropicBody.model;
    const isStream = !!anthropicBody.stream;
    const oaiBody = translateRequest(anthropicBody);

    console.log(`[${new Date().toISOString()}] ${isStream ? "stream" : "sync"} request, messages=${oaiBody.messages.length}, tools=${(oaiBody.tools || []).length}`);

    azureRequest(oaiBody, (azureRes, error) => {
      if (error) {
        console.error("Azure request error:", error);
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: error } }));
        return;
      }

      if (azureRes.statusCode >= 400) {
        let errBody = "";
        azureRes.on("data", (c) => (errBody += c));
        azureRes.on("end", () => {
          console.error(`Azure error ${azureRes.statusCode}:`, errBody);
          res.writeHead(azureRes.statusCode >= 500 ? 500 : 400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            type: "error",
            error: { type: azureRes.statusCode === 429 ? "rate_limit_error" : "api_error", message: errBody },
          }));
        });
        return;
      }

      if (isStream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        const translator = createStreamTranslator(res, reqModel);
        let lineBuf = "";
        azureRes.on("data", (chunk) => {
          lineBuf += chunk.toString();
          const lines = lineBuf.split("\n");
          lineBuf = lines.pop(); // keep incomplete line
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              const result = translator.processLine(trimmed);
              if (result === "done") { res.end(); return; }
            }
          }
        });
        azureRes.on("end", () => {
          if (lineBuf.trim()) translator.processLine(lineBuf.trim());
          if (!res.writableEnded) res.end();
        });
        azureRes.on("error", (e) => {
          translator.error(e.message);
          res.end();
        });
      } else {
        let respBody = "";
        azureRes.on("data", (c) => (respBody += c));
        azureRes.on("end", () => {
          try {
            const oaiResp = JSON.parse(respBody);
            const anthropicResp = translateResponse(oaiResp, reqModel);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(anthropicResp));
          } catch (e) {
            console.error("Response parse error:", e.message, respBody.slice(0, 200));
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "Failed to parse Azure response" } }));
          }
        });
      }
    });
  });
}

// --- Handle /v1/models (for model validation) ---

function handleModels(req, res) {
  // Return a minimal models response that satisfies Claude Code validation
  const model = req.url.split("/v1/models/")[1];
  if (model) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: model, object: "model", created: Date.now(), owned_by: "azure" }));
  } else {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: MODEL_NAME, object: "model", created: Date.now(), owned_by: "azure" }], object: "list" }));
  }
}

// --- Server ---

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url.startsWith("/v1/messages")) {
    handleMessages(req, res);
  } else if (req.method === "GET" && req.url.startsWith("/v1/models")) {
    handleModels(req, res);
  } else {
    // Pass-through for any other Anthropic API calls
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ type: "message", content: "ok" }));
  }
});

server.listen(LISTEN_PORT, "127.0.0.1", () => {
  console.log(`Anthropic-to-Azure proxy listening on 127.0.0.1:${LISTEN_PORT}`);
  console.log(`Azure endpoint: ${AZURE_ENDPOINT}`);
  console.log(`Model alias: ${MODEL_NAME}`);
});
