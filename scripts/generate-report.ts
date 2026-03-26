import { generateReport } from "../test/harness/reporter.js";

const reportPath = await generateReport();
console.log(`Report generated: ${reportPath}`);
