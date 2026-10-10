import assert from "node:assert/strict";
import { test } from "node:test";
import { requestsConversationExecution } from "../src/conversation/conversation-intent";
import { resolveConversationIntent } from "../src/conversation/conversation-intent-resolver";
for (const text of ["Do not modify any file or execute any write.", "Don't edit files and run commands.", "Never delete files nor execute scripts.", "Do not modify index.html, or execute any write."]) test(text,()=>assert.equal(requestsConversationExecution(text),false));
for (const text of ["Execute the command.", "Do not delete the file. Execute the command.", "Do not modify files or execute writes; run the tests.", "Don't delete it, write a new file.", "Do not edit or delete files, but execute the command.", "Do not modify files or execute writes then run tests."]) test(text,()=>assert.equal(requestsConversationExecution(text),true));
test("exact blocked objective resolves to inspection with precedence unchanged",()=>{
 const text="Inspect index.html and identify the actual Hero heading. Cite the exact source lines supporting the heading. Complete grounded understanding only. Do not create a modification plan or proposal. Do not modify any file or execute any write.";
 const context={activeInspections:[],certifiedUnderstanding:null,latestPlan:null,execution:null,pendingApprovals:[],workspace:null};
 assert.equal(resolveConversationIntent(text,context).route,"INSPECTION");
 assert.equal(resolveConversationIntent("Inspect index.html and modify the heading",context).route,"PLANNING");
});
