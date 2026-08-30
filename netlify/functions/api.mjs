import { Readable } from "node:stream";
import { rookRequestHandler } from "../../server.mjs";

const apiPath = (eventPath = "") => {
  const path = String(eventPath).split("?")[0];
  if (path.startsWith("/api/")) return path;
  const functionPrefix = "/.netlify/functions/api";
  const suffix = path.startsWith(functionPrefix)
    ? path.slice(functionPrefix.length)
    : path;
  return `/api${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
};

export async function handler(event = {}) {
  return new Promise((resolve, reject) => {
    const requestBody = event.body
      ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")
      : null;
    const request = Readable.from(requestBody ? [requestBody] : []);
    request.url = apiPath(event.path || event.rawUrl || "");
    request.method = String(event.httpMethod || "GET").toUpperCase();
    request.headers = event.headers || {};

    const chunks = [];
    const responseHeaders = {};
    let statusCode = 200;
    let finished = false;
    const finish = (chunk) => {
      if (finished) return;
      finished = true;
      if (chunk != null) chunks.push(Buffer.from(String(chunk)));
      resolve({
        statusCode,
        headers: responseHeaders,
        body: Buffer.concat(chunks).toString("utf8"),
      });
    };
    const response = {
      writeHead(nextStatus, headers = {}) {
        statusCode = Number(nextStatus) || 200;
        Object.assign(responseHeaders, headers);
        return this;
      },
      setHeader(name, value) {
        responseHeaders[String(name).toLowerCase()] = String(value);
      },
      write(chunk) {
        if (chunk != null) chunks.push(Buffer.from(String(chunk)));
        return true;
      },
      end: finish,
    };

    Promise.resolve(rookRequestHandler(request, response)).catch(reject);
  });
}
