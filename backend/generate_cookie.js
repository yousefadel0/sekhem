const { createHmac } = require('crypto');

const secret = "2a5da1c31ac79b3aa4a0cb2ad823bd3bc5ce7b71e4ada385f3fdb9ff9e925f5e";
const claims = { 
  sub: "e9dfe8be-9802-41a7-a656-15adff2d18d7", 
  sessionId: "session-1", 
  email: "user@example.test", 
  displayName: "User", 
  role: "Admin", 
  organizationId: "cmu18osvt0000v3j8xfyfb9cn", 
  iat: Math.floor(Date.now() / 1000), 
  exp: Math.floor(Date.now() / 1000) + 3600 
};

function cookieFor(c = claims) {
  const unsigned = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), 
    Buffer.from(JSON.stringify(c)).toString("base64url")
  ].join(".");
  return `sekhem_session=${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}

console.log(cookieFor());
