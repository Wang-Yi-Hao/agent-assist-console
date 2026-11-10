/**
 * 本地假数据版本号。
 * 唯一来源：db.js 用它判断 localStorage 里的数据是否需要重建，
 * generate.js 用它写入 meta.version —— 两处必须一致，否则每次刷新都会重建。
 */
export const DB_VERSION = 6
