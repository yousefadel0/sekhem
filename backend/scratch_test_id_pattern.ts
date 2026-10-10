// Quick check of the id pattern against plausible model-emitted ids
const pattern = /^[a-z][a-z0-9_-]*$/;
const candidates = ["fact-1", "f1", "F1", "fact_1", "fact1", "id-1", "ID1", "finding-1", "obs-1", "evidence-1", "inference-1", "inf-1"];
for (const c of candidates) console.log(c, pattern.test(c));
console.log("maxLength=64, minLength=1 enforced too");