/**
 * The shape of what pi hands a handler, declared once.
 *
 * Three handler files each declared their own `Input`/`Event` and they had already
 * started to drift. They are pi's event shapes, not any one handler's business.
 */
export type Input = Record<string, unknown>;
export type Event = { toolName?: unknown; input?: Input; toolCallId?: unknown };
