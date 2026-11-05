function initialBaggageComment(record) {
  const created = (record.history || []).find(event => /created/i.test(event.type || ''));
  const comment = String(created ? created.details?.comment || '' : record.comment || '').trim();
  if (!comment) return null;
  return {key:'comment', title:'Comment', at:created?.at || record.submittedAt || record.createdAt,
    by:created?.by || record.submittedBy || record.createdBy || 'System', fields:[['Comment', comment]]};
}
function hasComment(events, comment) {
  return events.some(event => event.key === 'comment' && (event.fields || []).some(([key,value]) => key === 'Comment' && value === comment.fields[0][1]));
}
module.exports = {initialBaggageComment,hasComment};
