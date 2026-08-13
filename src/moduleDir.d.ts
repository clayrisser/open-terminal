/**
 * Absolute path of the directory holding the build that is currently running,
 * either `lib/` or `es/`.
 *
 * `__dirname` and `import.meta.url` cannot both be written in one TypeScript
 * source file, so each build gets a hand-written implementation copied into
 * place. This declaration is what the TypeScript sources compile against.
 */
declare const moduleDir: string;
export default moduleDir;
