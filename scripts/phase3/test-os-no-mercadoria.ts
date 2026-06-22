import { validateCashLaunchData } from '../../src/services/cashRegisterValidation';

(async () => {
  try {
    const invalidLaunch = {
      orderNumber: 'LC-TEST-0001',
      clientName: 'Cliente Teste',
      status: 'Finalizado',
      openingDate: new Date().toISOString(),
      expectedDate: new Date().toISOString(),
      items: [],
      merchandiseTotal: 0,
      servicesTotal: 0,
      discountTotal: 0,
      total: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any;

    try {
      validateCashLaunchData(invalidLaunch);
      console.error('TEST FAILED: validation did not throw for O.S. sem mercadoria');
      process.exit(2);
    } catch (err: any) {
      console.log('TEST PASSED: validation rejected O.S. sem mercadoria:', err.message || err);
      process.exit(0);
    }
  } catch (err) {
    console.error('TEST ERROR:', err);
    process.exit(3);
  }
})();
