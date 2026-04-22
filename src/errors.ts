/**
 * Typed error classes emitted by the multiplayer SDK.
 *
 * All errors extend the built-in `Error` and preserve the proper
 * prototype chain so `instanceof` checks work across both CJS and ESM
 * bundle boundaries.
 */

function ensurePrototype(instance: Error, ctor: Function): void {
  // Required when targeting ES5 / downstream bundlers that flatten the
  // prototype chain of subclassed `Error`s.
  Object.setPrototypeOf(instance, ctor.prototype);
}

/** The SDK was used before `.connect()` resolved. */
export class SdkNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SdkNotReadyError';
    ensurePrototype(this, SdkNotReadyError);
  }
}

/** A role-specific API was invoked from the wrong role. */
export class SdkRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SdkRoleError';
    ensurePrototype(this, SdkRoleError);
  }
}

/** A phase-specific API was invoked from the wrong phase. */
export class SdkPhaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SdkPhaseError';
    ensurePrototype(this, SdkPhaseError);
  }
}

/** A destructive call was made after `.destroy()`. */
export class SdkDestroyedError extends Error {
  constructor(message = 'The SDK has been destroyed') {
    super(message);
    this.name = 'SdkDestroyedError';
    ensurePrototype(this, SdkDestroyedError);
  }
}
