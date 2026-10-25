import { Review } from "../models/Review.js";
// Historical/manual rows do not earn reputation merely by containing stars.
export async function verifiedReviews(filter={}, session=null, limit=0) {
  const aggregate=Review.aggregate([
    {$match:{...filter,sampleData:{$ne:true}}},
    {$lookup:{from:"projects",localField:"projectId",foreignField:"_id",as:"project"}},{$unwind:"$project"},
    {$match:{"project.status":"COMPLETED","project.sampleData":{$ne:true}}},
    {$lookup:{from:"bids",localField:"project.acceptedBidId",foreignField:"_id",as:"bid"}},{$unwind:"$bid"},
    {$match:{"bid.status":"ACCEPTED",$expr:{$and:[{$ne:["$reviewerId","$revieweeId"]},{$or:[{$and:[{$eq:["$reviewerId","$project.clientId"]},{$eq:["$revieweeId","$bid.studentId"]}]},{$and:[{$eq:["$revieweeId","$project.clientId"]},{$eq:["$reviewerId","$bid.studentId"]}]}]}]}}},
    {$lookup:{from:"milestones",localField:"projectId",foreignField:"projectId",as:"checkpoints"}},
    {$match:{$expr:{$and:[{$gt:[{$size:"$checkpoints"},0]},{$eq:[{$size:"$checkpoints"},{$size:{$filter:{input:"$checkpoints",as:"m",cond:{$in:["$$m.status",["APPROVED","RELEASED"]]}}}}]}]}}},
    {$sort:{createdAt:-1,_id:-1}}, ...(limit?[{$limit:limit}]:[]), {$project:{_id:1}}
  ]);
  if(session) aggregate.session(session);
  const ids=await aggregate;
  let query=Review.find({_id:{$in:ids.map(row=>row._id)}}).sort({createdAt:-1,_id:-1}).populate("reviewerId","name avatarUrl college role").populate("projectId","title");
  if(session) query=query.session(session);
  return query;
}
