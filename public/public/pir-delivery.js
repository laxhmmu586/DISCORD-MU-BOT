(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PirDelivery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const methods = {
    permanent: ['Delivery to a permanent address', '寄件，提供永久地址'],
    temporary: ['Delivery to a temporary address', '寄件，提供临时地址'],
    pickup: ['Collect at the airport', '取件：自行来机场取']
  };
  const notice = [
    'Please note: Once the baggage is handed over for delivery, it will be handled by a third-party delivery service. Due to delivery arrangements and actual operating conditions, we are unable to provide or confirm a specific delivery time.',
    '请注意：行李交付配送后，由第三方配送服务负责后续运输。由于配送安排及实际情况，我们无法提供或确认具体送达时间。'
  ];
  const hints = {
    permanent: ['Please provide an address where you can receive your baggage.', '请填写可以接收行李的地址。'],
    temporary: ['We will contact you by email to confirm the delivery arrangements before shipping.', '邮寄前我们会通过邮件与您沟通确认配送安排。'],
    pickup: ['We will notify you by email when your baggage is available for collection at the airport.', '行李可取件时，我们会发送邮件通知您来机场自行领取。']
  };
  const pick = (pair, language) => pair[language === 'zh' ? 1 : 0];
  function fields(record, language = 'en') {
    const method = record.deliveryPreference;
    const rows = [[pick(['Collection / delivery method', '取件方式'], language),
      methods[method] ? pick(methods[method], language) : pick(['Not provided (legacy report)', '未填写（旧版记录）'], language)]];
    if (method !== 'pickup') {
      if (record.permanentAddress && method !== 'temporary') rows.push([pick(['Permanent address', '永久地址'], language), record.permanentAddress]);
      if (record.temporaryAddress && method !== 'permanent') rows.push([pick(['Temporary address', '临时地址'], language), record.temporaryAddress]);
      if (record.temporaryAddressValidUntil && method !== 'permanent') rows.push([pick(['Temporary address valid until', '临时地址有效期至'], language), record.temporaryAddressValidUntil]);
    }
    if (hints[method]) rows.push([pick(['Instructions', '提示'], language), pick(hints[method], language)]);
    return rows;
  }
  function normalize(body) {
    if (String(body.caseType || '').trim().toUpperCase() === 'DPR') {
      return { deliveryPreference: '', permanentAddress: '', temporaryAddress: '', temporaryAddressValidUntil: '', addressAvailable: '' };
    }
    const method = String(body.deliveryPreference || '').trim();
    const clean = (value, max) => String(value || '').trim().slice(0, max);
    if (method && !Object.hasOwn(methods, method)) throw new Error('Invalid collection / delivery method');
    const permanentAddress = method === 'pickup' || method === 'temporary' ? '' : clean(body.permanentAddress, 500);
    const temporaryAddress = method === 'pickup' || method === 'permanent' ? '' : clean(body.temporaryAddress, 500);
    if ((!method || method === 'permanent') && !permanentAddress) throw new Error('An address where you can receive baggage is required');
    if (method === 'temporary' && !temporaryAddress) throw new Error('Temporary delivery address is required');
    return {
      deliveryPreference: method, permanentAddress, temporaryAddress,
      temporaryAddressValidUntil: method === 'pickup' || method === 'permanent' ? '' : clean(body.temporaryAddressValidUntil, 40),
      addressAvailable: method ? (method === 'temporary' ? 'Yes' : 'No') : clean(body.addressAvailable, 20)
    };
  }
  return { methods, notice, hints, pick, fields, normalize };
});
