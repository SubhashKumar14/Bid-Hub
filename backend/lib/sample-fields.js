export function sampleFields(schema) {
  schema.add({sampleData:{type:Boolean,default:false},sampleKey:String});
  schema.index({sampleKey:1},{unique:true,partialFilterExpression:{sampleKey:{$type:"string"}}});
}
