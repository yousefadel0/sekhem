// Using global fetch available in Node.js
import * as readline from 'readline';

function promptPassword(query) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = function _writeToOutput(string) {
      if (string.trim().length === 0) rl.output.write(string);
      else rl.output.write('');
    };
    rl.question(query, pwd => {
      rl.close();
      resolve(pwd);
    });
  });
}

(async () => {
  const password = await promptPassword('Enter admin password for login test (hidden): ');
  if (!password) {
    console.error('Password required');
    process.exit(1);
  }
  try {
    const res = await fetch('http://127.0.0.1:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@sekhem.local', password })
    });
    const data = await res.json();
    console.log('Login response status:', res.status);
    if (res.ok) {
      console.log('Received token length:', data.accessToken?.length ?? 'none');
    } else {
      console.log('Error response:', data);
    }
  } catch (e) {
    console.error('Request failed:', e);
  }
})();
