import { generateReport } from "../test/harness/reporter.js";

async function main() {
  const reportPath = await generateReport();
  console.log(`Report written to ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
