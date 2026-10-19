const dns = require('dns');
const path = require('path');
const dotenv = require('dotenv');

// Always load backend/.env, no matter which folder the process was started from
dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

// mongodb+srv looks up a DNS SRV record through Node's resolver. On Windows that
// resolver can report only 127.0.0.1 even when the adapter has a working DNS
// server and nothing is listening on port 53, which fails with querySrv ECONNREFUSED.
const loopback = new Set(['127.0.0.1', '::1']);
const configured = dns.getServers().filter((server) => !loopback.has(server));
if (configured.length === 0) {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
}
