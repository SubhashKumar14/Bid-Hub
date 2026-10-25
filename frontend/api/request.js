// All API calls have a bounded wait. A write timeout is an unknown outcome,
// never an automatic retry or an optimistic success.
export function installRequestTimeouts() {
  const original=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==="string"?input:input.url,window.location.origin);
    if(url.origin!==window.location.origin || !url.pathname.startsWith("/api/")) return original(input,options);
    const controller=new AbortController(), external=options.signal;
    const abort=()=>controller.abort(external.reason); external?.addEventListener("abort",abort,{once:true});
    if(external?.aborted) abort();
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;controller.abort();}, /uploads|import/.test(url.pathname)?60000:20000);
    try {
      const received=await original(input,{...options,signal:controller.signal});
      const bytes=await received.arrayBuffer();
      const response=new Response([204,205,304].includes(received.status)?null:bytes,{status:received.status,statusText:received.statusText,headers:received.headers});
      if(response.ok && !["GET","HEAD"].includes((options.method || "GET").toUpperCase())) window.dispatchEvent(new Event("bidhub:refresh"));
      return response;
    } catch(error) {
      if(timedOut) throw new Error("This request is taking too long. Refresh to check whether your changes were saved before trying again.");
      if(!external?.aborted && error instanceof TypeError) throw new Error(["GET","HEAD"].includes((options.method || "GET").toUpperCase()) ? "Could not reach Bid·Hub. Check your connection and try again." : "The connection was interrupted. Your changes may have been saved. Refresh to check before trying again.");
      throw error;
    }
    finally {clearTimeout(timer);external?.removeEventListener("abort",abort);}
  };
}
