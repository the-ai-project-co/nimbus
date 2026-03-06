export const VERSION = '0.4.1';

const _RAW_BUILD_DATE = '__BUILD_DATE__';
export const BUILD_DATE = _RAW_BUILD_DATE.startsWith('__') ? 'dev' : _RAW_BUILD_DATE;
