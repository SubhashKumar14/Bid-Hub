// Authenticated operator API client; never edits a case/project directly.
const [projectId,caseId,action,expectedVersion,requestId,...words]=process.argv.slice(2);
const base=process.env.BIDHUB_API_URL, token=process.env.OPERATOR_TOKEN;
if(!base || !token) throw new Error("Set BIDHUB_API_URL and OPERATOR_TOKEN. Arguments: projectId caseId RESUME|RESOLVE expectedVersion requestId reason.");
const response=await fetch(`${base.replace(/\/$/,"")}/api/projects/${projectId}/recovery/${caseId}`,{method:"PATCH",signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({action,expectedVersion:Number(expectedVersion),requestId,reason:words.join(" ")})});
const result=await response.json(); if(!response.ok) throw new Error(result.message); console.log(JSON.stringify(result,null,2));
