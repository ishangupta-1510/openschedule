import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const requested = decodeURIComponent(
        url.pathname === "/" ? "/demo/index.html" : url.pathname,
      );
      const file = path.resolve(root, "." + requested);
      if (
        !file.startsWith(root + path.sep) ||
        !["demo", "src", "dist"].includes(
          path.relative(root, file).split(path.sep)[0],
        )
      ) {
        res.writeHead(403).end();
        return;
      }
      const bytes = await readFile(file);
      res
        .writeHead(200, {
          "content-type":
            mime[path.extname(file)] ?? "application/octet-stream",
          "cache-control": "no-store",
        })
        .end(bytes);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(Number(process.env.PORT ?? 42719), "127.0.0.1", () =>
    console.log("OpenSchedule demo: http://127.0.0.1:42719"),
  );
