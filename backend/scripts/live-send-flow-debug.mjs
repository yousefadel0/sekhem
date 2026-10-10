/**
 * live-send-flow-debug.mjs
 *
 * Live end-to-end debug of the SEKHEM Send flow.
 * Runs against the real backend at http://localhost:3001
 * Using Node.js built-in fetch.
 *
 * Usage: node backend/scripts/live-send-flow-debug.mjs <password>
 */
import { readFileSync } from 'fs';

function loadEnv(p) {
  try {
    const c = readFileSync(p, 'utf8');
    for (const l of c.split(/\r?\n/)) {
      const t = l.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('='); if (i === -1) continue;
      const k = t.slice(0, i).trim(), v = t.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadEnv('backend/.env');

const BASE = 'http://localhost:3001/api';
const ADMIN_EMAIL = 'admin@sekhem.local';
const PROJECT_ID = 'project-community-sonic-sovereign';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node backend/scripts/live-send-flow-debug.mjs <password>');
  process.exit(1);
}

async function req(method, path, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), json };
}

(async () => {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('SEKHEM LIVE SEND FLOW DEBUG');
  console.log('══════════════════════════════════════════════════════\n');

  // STEP 1: Login
  console.log('[1] POST /api/auth/login');
  const login = await req('POST', '/auth/login', { email: ADMIN_EMAIL, password });
  console.log('    Status:', login.status);

  if (login.status !== 200) {
    console.error('    ❌ Login failed:', JSON.stringify(login.json, null, 2));
    process.exit(1);
  }

  // Extract cookie from Set-Cookie
  const setCookieHeader = login.headers['set-cookie'];
  if (!setCookieHeader) {
    console.error('    ❌ No Set-Cookie header in login response');
    console.log('    Response headers:', login.headers);
    process.exit(1);
  }

  // Extract the cookie value to send in subsequent requests
  const cookieValue = setCookieHeader.split(';')[0]; // e.g. "sekhem_session=..."
  console.log('    ✓ Login succeeded');
  console.log('    Cookie name portion:', cookieValue.split('=')[0]);
  console.log('    Session expiry from body:', login.json?.data?.expiresAt);

  // STEP 2: GET /api/projects
  console.log('\n[2] GET /api/projects');
  const projects = await req('GET', '/projects', null, cookieValue);
  console.log('    Status:', projects.status);
  console.log('    Response envelope keys:', projects.json ? Object.keys(projects.json) : 'null');
  if (projects.json?.data) {
    console.log('    data type:', Array.isArray(projects.json.data) ? 'array' : typeof projects.json.data);
    console.log('    data length:', Array.isArray(projects.json.data) ? projects.json.data.length : 'n/a');
    if (Array.isArray(projects.json.data) && projects.json.data.length > 0) {
      const p = projects.json.data[0];
      console.log('    First project id:', p.id);
      console.log('    First project name:', p.name);
    }
  } else {
    console.log('    ❌ No data in projects response:', JSON.stringify(projects.json, null, 2));
  }

  const selectedProjectId = Array.isArray(projects.json?.data) && projects.json.data.length > 0
    ? projects.json.data[0].id
    : null;

  if (!selectedProjectId) {
    console.error('\n    ❌ BLOCKER: No projects returned. selectedProjectId will be null in frontend → Send will be blocked.');
    process.exit(1);
  }
  console.log('    ✓ selectedProjectId =', selectedProjectId);
  const isCanonical = selectedProjectId === PROJECT_ID;
  console.log('    ✓ Matches canonical id:', isCanonical);

  // STEP 3: POST /api/conversations (create conversation)
  console.log('\n[3] POST /api/conversations');
  const title = 'Live debug test ' + Date.now();
  const createConv = await req('POST', '/conversations', {
    projectId: selectedProjectId,
    title,
  }, cookieValue);
  console.log('    Status:', createConv.status);
  console.log('    Response:', JSON.stringify(createConv.json, null, 2));

  if (createConv.status !== 200 && createConv.status !== 201) {
    console.error('\n    ❌ BLOCKER: POST /api/conversations failed at status', createConv.status);
    process.exit(1);
  }

  const convId = createConv.json?.data?.id;
  if (!convId) {
    console.error('\n    ❌ BLOCKER: POST /api/conversations returned no conversation id');
    console.error('    data:', createConv.json?.data);
    process.exit(1);
  }
  console.log('    ✓ Conversation created, id =', convId);

  // STEP 4: POST /api/conversations/:id/messages
  console.log('\n[4] POST /api/conversations/' + convId + '/messages');
  const postMsg = await req('POST', `/conversations/${convId}/messages`, {
    content: 'Analyze SONiC telemetry and BGP route flapping',
    senderType: 'user',
  }, cookieValue);
  console.log('    Status:', postMsg.status);
  console.log('    Response:', JSON.stringify(postMsg.json, null, 2));

  if (postMsg.status !== 200 && postMsg.status !== 201) {
    console.error('\n    ❌ BLOCKER: POST /api/conversations/:id/messages failed at status', postMsg.status);
    process.exit(1);
  }

  const msgId = postMsg.json?.data?.id;
  if (!msgId) {
    console.error('\n    ❌ BLOCKER: POST /api/conversations/:id/messages returned no message id');
    process.exit(1);
  }

  console.log('    ✓ Message posted, id =', msgId);
  console.log('    ✓ senderType =', postMsg.json?.data?.senderType);
  console.log('    ✓ content =', postMsg.json?.data?.content);
  console.log('    ✓ createdAt =', postMsg.json?.data?.createdAt);

  // STEP 5: Verify frontend envelope parsing (body.data contract check)
  console.log('\n[5] Frontend envelope contract verification');
  console.log('    Backend envelope: { data, meta, errors }');
  console.log('    Frontend fetchSekhemApi returns: body.data');
  console.log('    fetchProjects returns: result (if Array.isArray(result))');
  console.log('    createConversation returns: body.data (ConversationSummaryDto)');
  console.log('    postConversationMessage returns: body.data (ConversationMessageDto)');

  const convData = createConv.json?.data;
  const msgData = postMsg.json?.data;

  // Check that all required fields the frontend depends on are present
  const convFields = ['id', 'projectId', 'userId', 'title', 'status', 'createdAt', 'updatedAt'];
  const msgFields = ['id', 'conversationId', 'senderId', 'senderType', 'content', 'metadata', 'createdAt'];

  console.log('\n    ConversationSummaryDto field check:');
  for (const f of convFields) {
    const present = convData && f in convData;
    console.log(`      ${present ? '✓' : '❌'} ${f}: ${present ? JSON.stringify(convData[f]) : 'MISSING'}`);
  }

  console.log('\n    ConversationMessageDto field check:');
  for (const f of msgFields) {
    const present = msgData && f in msgData;
    console.log(`      ${present ? '✓' : '❌'} ${f}: ${present ? JSON.stringify(msgData[f]) : 'MISSING'}`);
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log('✅  FULL SEND FLOW SUCCEEDED — no blockers found');
  console.log('══════════════════════════════════════════════════════\n');
})().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
