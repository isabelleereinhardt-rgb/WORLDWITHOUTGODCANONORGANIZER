/* A stand-in LLM provider that speaks the OpenAI request shape, so the
   assistant's API path can be tested end to end with no real key and no
   money spent. It records every request for inspection.

   POST /v1/chat/completions  -> a markdown answer
   POST /fail/v1/chat/completions -> 401, to test the graceful fallback
   GET  /_requests            -> everything it has been sent
*/
const http = require("http");
const requests = [];

http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/_requests") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(requests));
  }
  let body = "";
  req.on("data", c => (body += c));
  req.on("end", () => {
    let parsed = null;
    try { parsed = JSON.parse(body); } catch (e) {}
    requests.push({ url: req.url, headers: req.headers, body: parsed });

    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "content-type": "application/json",
    };
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }

    if (req.url.startsWith("/fail")) {
      res.writeHead(401, cors);
      return res.end(JSON.stringify({ error: { message: "Invalid API key provided." } }));
    }

    // Echo back proof that the passages and question actually arrived,
    // formatted as markdown so the renderer is exercised too.
    const msgs = (parsed && parsed.messages) || [];
    const last = msgs[msgs.length - 1] || {};
    const nameMatch = /MY QUESTION: (.*)$/.exec(String(last.content || ""));
    const passageCount = (String(last.content || "").match(/^\[\d+\]/gm) || []).length;
    const question = nameMatch ? nameMatch[1].trim() : "(none)";
    const lines = [
      "## What the passages say",
      "",
      "I received **" + passageCount + "** passages and the question " +
        "*" + question + "*.",
      "",
      "- Grounded in the writer's own entries",
      "- Rendered from `markdown`",
      "",
      "> Nothing here was invented.",
    ];
    // when the writer asks for something to be done, propose the action
    // the same way a real model is instructed to
    if (/forget|remind|should really/i.test(question)) {
      lines.push("", "```action",
        JSON.stringify({ do: "task.add", text: "Revise the Gherci fashion notes" }),
        "```");
    }
    const answer = lines.join("\n");

    res.writeHead(200, cors);
    res.end(JSON.stringify({
      choices: [{ message: { role: "assistant", content: answer } }],
    }));
  });
}).listen(8322, () => console.log("stub provider on 8322"));
