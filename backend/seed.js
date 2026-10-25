import {seedSamples} from "./scripts/seed-samples.js";
seedSamples().then(console.log).catch(error=>{console.error(error.message);process.exitCode=1;});
