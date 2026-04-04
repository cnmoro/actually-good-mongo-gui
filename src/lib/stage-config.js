// Aggregation stage definitions and templates

export const STAGE_OPERATORS = [
  { operator: '$match', label: 'Match', description: 'Filter documents', color: 'blue', template: '{\n  "field": "value"\n}' },
  { operator: '$project', label: 'Project', description: 'Reshape documents', color: 'emerald', template: '{\n  "field": 1,\n  "_id": 0\n}' },
  { operator: '$group', label: 'Group', description: 'Group and aggregate', color: 'purple', template: '{\n  "_id": "$field",\n  "count": { "$sum": 1 }\n}' },
  { operator: '$sort', label: 'Sort', description: 'Sort documents', color: 'amber', template: '{\n  "field": -1\n}' },
  { operator: '$limit', label: 'Limit', description: 'Limit result count', color: 'rose', template: '10' },
  { operator: '$skip', label: 'Skip', description: 'Skip documents', color: 'yellow', template: '0' },
  { operator: '$lookup', label: 'Lookup', description: 'Join collections', color: 'teal', template: '{\n  "from": "collection",\n  "localField": "field",\n  "foreignField": "_id",\n  "as": "joined"\n}' },
  { operator: '$unwind', label: 'Unwind', description: 'Deconstruct arrays', color: 'orange', template: '"$arrayField"' },
  { operator: '$addFields', label: 'Add Fields', description: 'Add new fields', color: 'sky', template: '{\n  "newField": "$existingField"\n}' },
  { operator: '$count', label: 'Count', description: 'Count documents', color: 'red', template: '"total"' },
  { operator: '$facet', label: 'Facet', description: 'Multi-faceted aggregation', color: 'violet', template: '{\n  "facet1": [{ "$match": {} }],\n  "facet2": [{ "$count": "total" }]\n}' },
];

export function getStageConfig(operator) {
  return STAGE_OPERATORS.find(s => s.operator === operator) || STAGE_OPERATORS[0];
}

export function createStage(operator = '$match') {
  const config = getStageConfig(operator);
  return {
    id: `stage_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    operator,
    body: config.template,
    enabled: true,
    collapsed: false,
    comment: '',
    validationError: null,
  };
}

export function stageToMongo(stage) {
  if (!stage.enabled) return null;
  let parsedBody;
  try {
    const objectIdHelper = (hex) => ({ __webmongoObjectId: String(hex || '') });
    parsedBody = new Function('ObjectId', `return (${stage.body})`)(objectIdHelper);
  } catch {
    return null;
  }
  return { [stage.operator]: parsedBody };
}

export function pipelineToMongo(stages) {
  return stages.map(stageToMongo).filter(Boolean);
}

export function pipelineToJSON(stages) {
  const mongoStages = pipelineToMongo(stages);
  return JSON.stringify(mongoStages, null, 2);
}

export function pipelineToJS(collectionName, stages) {
  const mongoStages = pipelineToMongo(stages);
  return `db.${collectionName}.aggregate(${JSON.stringify(mongoStages, null, 2)})`;
}
