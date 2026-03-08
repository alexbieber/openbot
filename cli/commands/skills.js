// skills.js
const GATEWAY = 'http://127.0.0.1:18789';

export async function skillsList() {
  try {
    const res = await fetch(`${GATEWAY}/skills`);
    const skills = await res.json();
    console.log(`\n🔌 Installed Skills (${skills.length}):\n`);
    skills.forEach(s => console.log(`  • ${s.name.padEnd(20)} ${s.description.substring(0, 60)}`));
    console.log('');
  } catch { console.error('⚠️  Gateway not running.'); }
}

export async function skillsInstall(name) {
  console.log(`\n📦 Installing skill: ${name}`);
  console.log(`   Browse skills at: https://github.com/openbot/openbot\n`);
  console.log(`   Manual install: Copy skill folder to ./skills/${name}/\n`);
}
