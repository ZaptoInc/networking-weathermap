const express = require("express");
const fetch = require("node-fetch");
const app = express();
app.use(express.json());

const config = require("./config.json");

const PORT = process.env.PORT || config.port || 3001;
const interval = process.env.INTERVAL || config.interval || 1

let nodes = {};

app.get("/rest/nodes/:nodeid/", async function (req, res) {
  if (nodes[req.params.nodeid]) {
    res.json(Object.values(nodes[req.params.nodeid].stats));
  } else {
    res.status(404);
    res.json({ error: true, message: "NOT_FOUND" });
  }
});

app.get("/rest/nodes/:nodeid/:interfaceid", async function (req, res) {
  if (
    nodes[req.params.nodeid] &&
    nodes[req.params.nodeid].stats[req.params.interfaceid]
  ) {
    res.json(nodes[req.params.nodeid].stats[req.params.interfaceid]);
  } else {
    res.status(404);
    res.json({ error: true, message: "NOT_FOUND" });
  }
});

app.listen(PORT, () => {
  console.log("Server Listening on PORT:", PORT);
});

for (let i = 0; i < config.nodes.length; i++) {
  const node = { ...config.nodes[i] };
  nodes[node.id] = node;
  nodes[node.id].caching = { latest: null, previous: null };
  nodes[node.id].stats = {};
}

let nodeChecker = setInterval(async () => {
  Object.values(nodes).forEach((node) => {
    switch (node.type) {
      case "mikrotik":
        mikrotikAPI(node);
        break;

      default:
        break;
    }
  });
}, interval * 1000);

async function mikrotikAPI(node) {
  try {
    const resp = await fetch(`${node.url}/rest/interface`, {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(node.username + ":" + node.password).toString("base64"),
      },
    });
    const timestamp = new Date();
    if (!node.caching.latest || node.caching.latest.timestamp < timestamp) {
      node.caching.previous = node.caching.latest;
      let data = await resp.json();
      node.caching.latest = { data, timestamp };
    }
    node.stats = {};
    if (node.caching.previous && node.caching.latest) {
      for (let i = 0; i < node.caching.previous.data.length; i++) {
        const interface_latest = node.caching.latest.data[i];
        const interface_previous = node.caching.previous.data[i];
        const node_interval = node.caching.latest.timestamp - node.caching.previous.timestamp
        node.stats[interface_latest[".id"]] = {
          id: interface_latest[".id"],
          interval:
          node_interval,
          "rx-byte":
            Math.ceil((interface_latest["rx-byte"] - interface_previous["rx-byte"]) / node_interval * 1000),
          "rx-packet":
          Math.ceil((interface_latest["rx-packet"] - interface_previous["rx-packet"]) / node_interval * 1000),
          "rx-bits":
          Math.ceil(((interface_latest["rx-byte"] - interface_previous["rx-byte"]) / node_interval * 1000) * 8),
          "tx-byte":
          Math.ceil((interface_latest["tx-byte"] - interface_previous["tx-byte"])/ node_interval * 1000),
          "tx-packet":
          Math.ceil((interface_latest["tx-packet"] - interface_previous["tx-packet"]) / node_interval * 1000),
          "tx-bits":
          Math.ceil(((interface_latest["tx-byte"] - interface_previous["tx-byte"]) / node_interval * 1000) * 8),
        };
      }
    }
  } catch (error) {
    console.error(error);
  }
}
