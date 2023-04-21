import { spawnSync } from "child_process";
import fs from "fs";
import { createServer } from "http";
import { fileURLToPath, URL } from "url";
import { dirname, resolve } from "path";

import http from "http";
import https from "https";


const PORT = process.env.faux_port || 8043;

const __dirname = dirname(fileURLToPath(import.meta.url));

function log(message: string): void {
    console.log(message);
    fs.appendFileSync(resolve(".fauxNpm.log"), message);
}

function loadJson(filename: string) {
    return JSON.parse(fs.readFileSync(filename).toString());
}

function getPackageInfo(name: string): null | string {
    const pkgPath = resolve(__dirname, "faux_modules", name);
    try {
        const stat = fs.statSync(pkgPath)
        if (!stat.isDirectory()) { throw new Error("not a directory"); }
    } catch (error) { return null; }

    const info = loadJson(resolve(pkgPath, "package.json"));

    // Create the npm packaged tarball
    const child = spawnSync("npm", [ "pack", "--json" ], { cwd: pkgPath });
    if (child.status !== 0) {
        throw new Error("npm pack failed");
    }
    const filename = JSON.parse(child.stdout.toString())[0].filename;

    info.dist = {
        tarball: `http:/\/localhost:${ PORT }/__packages__/${ name }/${ filename }`
    };
    info.maintainers = [ info.author ];

    const versions: Record<string, any> = { };
    versions[info.version] = info;

    const time: Record<string, string> = { };
    time[info.version] = "2020-11-17T00:00:00.000Z";

    return JSON.stringify({
        "dist-tags": { latest: info.version },
        name: info.name,

        readmeFilename: "README.md",
        readme: "README",

        author: info.author,
        _id: info.name,
        bugs: info.bugs,
        description: info.description,
        homepage: info.homepage,
        license: info.license,
        repository: info.repository,
        maintainers: info.maintainers,

        time: time,
        versions: versions,
    });
}

async function readStream(stream: http.IncomingMessage): Promise<Buffer> {
    let data = Buffer.alloc(0);
    return new Promise((resolve, reject) => {
        stream.on("data", (chunk) => {
            data = Buffer.concat([ data, chunk ]);
        });

        stream.on("end", () => { resolve(data); });
        stream.on("error", (error) => { reject(error); });
    });
}

async function forwardRequest(req: http.IncomingMessage): Promise<Buffer> {
    const url = new URL(req.url || "", "https:/\/registry.npmjs.org");

    let body: null | Buffer = null;
    if (req.method === "POST") { body = await readStream(req); }

    const headers = req.headers;
    headers["host"] = "registry.npmjs.org";

    return new Promise((resolve, reject) => {
        const newReq = https.request(url, { headers, method: req.method }, (resp) => {
            readStream(resp).then(resolve, reject);
        });

        newReq.on("error", (error) => { reject(error); });

        if (body != null) { newReq.write(body); }

        newReq.end();
    });
}

const server = createServer(async (req, resp) => {
    const method = req.method;
    const url = new URL(req.url || "", `http:/\/localhost:${ PORT }`);
    const packageName = (url.pathname ? url.pathname: "/").substring(1).replace(/%([0-9a-f][0-9a-f])/ig, (all: string, escape: string) => {
        return String.fromCharCode(parseInt(escape, 16));
    });

    let result: string | Buffer;
    if (packageName.split("/")[0] === "__packages__") {
        let comps = packageName.split("/");
        comps.shift();
        const filename = resolve(__dirname, "faux_modules", comps.join("/"));
        log(`  Faux-NPM: Using local tarball (${ filename })...`);
        result = fs.readFileSync(filename);

    } else {
        let info;
        try {
            if (!packageName.startsWith("-")) {
                info = await getPackageInfo(packageName);
            }
        } catch (error) {
            resp.writeHead(404, "NOT FOUND");
            resp.end();
            return;
        }

        if (info) {
            log(`  Faux-NPM: Using local pkg (${ packageName })...`);
            result = info;
        } else {
            log(`  Faux-NPM: Forwarding to NPM (${ req.url })...`);
            result = await forwardRequest(req);
        }
    }

    resp.write(result);
    resp.end();
});

server.listen(PORT, () => {
    log(`Started faux-registry on ${ PORT }...`);
});

server.on("error", (error) => {
    log("Error");
    log(error.toString());
});
