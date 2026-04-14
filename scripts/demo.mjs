import { spawn } from "node:child_process";

const run = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });

async function main() {
  console.log("1) Start a local chain in another terminal: npm run local-chain");
  console.log("2) Deploy contract: npm run deploy-local");
  console.log("3) Add deployment address to .env as VITE_BATTLESHIP_ADDRESS");
  console.log("4) Launch UI:");
  await run("npm", ["run", "frontend:dev"], process.cwd());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
