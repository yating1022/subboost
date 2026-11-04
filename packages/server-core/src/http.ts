export type ApiErrorBody<Code extends string = string> = {
  error: string;
  code: Code;
};

export function buildApiErrorBody<Code extends string>(
  error: string,
  code: Code
): ApiErrorBody<Code> {
  return { error, code };
}
