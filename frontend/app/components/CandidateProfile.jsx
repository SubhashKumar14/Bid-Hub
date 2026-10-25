import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
export function CandidateProfile({userId,onClose}) {
  const [data,setData]=useState(null),[work,setWork]=useState([]),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  useEffect(()=>{const controller=new AbortController();setError("");setData(null);
    Promise.all([fetch(`/api/users/${userId}`,{signal:controller.signal}),fetch(`/api/users/${userId}/work-record`,{signal:controller.signal})]).then(async responses=>{if(responses.some(r=>!r.ok))throw new Error("Candidate work record unavailable. Retry to load persisted evidence.");const [profile,projects]=await Promise.all(responses.map(r=>r.json()));if(!controller.signal.aborted){setData(profile);setWork(projects);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();
  },[userId,retry]);
  return <Dialog open={Boolean(userId)} onOpenChange={open=>!open&&onClose()}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogTitle>Candidate profile and work record</DialogTitle><DialogDescription>Persisted profile, completed work and participant reviews.</DialogDescription>{error?<p role="alert">{error} <Button onClick={()=>setRetry(n=>n+1)}>Retry profile</Button></p>:!data?<p role="status">Loading profile…</p>:<><h2>{data.user.name}{data.user.sampleData?" · Sample account":""}</h2><p>{data.user.bio}</p><p>{data.user.skills?.join(", ")}</p><p>{data.reviews.length?`${data.user.rating} from ${data.reviews.length} participant reviews`:"No reviews yet"}</p>{work.map(project=><p key={project._id}>{project.title} · {project.category}{project.sampleData?" · Sample work":""}</p>)}{data.reviews.map(review=><article key={review._id}><p>{review.rating}/5 · {review.comment}</p></article>)}</>}</DialogContent></Dialog>;
}
