// gateway.js
const GATEWAY = 'http://127.0.0.1:18789';

export async function gatewayStatus() {
  try {
    const res = await fetch(`${GATEWAY}/health`);
    const h = await res.json();
    console.log(`\n✅ Gateway: RUNNING`);
    console.log(`   Version:  ${h.version}`);
    console.log(`   Model:    ${h.model}`);
    console.log(`   Channels: ${h.connectedChannels} connected`);
    console.log(`   Uptime:   ${Math.round(h.uptime)}s\n`);
  } catch {
    console.log('\n❌ Gateway: NOT RUNNING\n   Start with: npm start\n');
  }
}

export async function gatewayStop() {
  console.log('\n⏹  To stop the gateway, press Ctrl+C in the gateway terminal.\n');
}
