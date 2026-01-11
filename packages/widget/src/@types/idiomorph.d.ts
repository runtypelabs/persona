declare module "idiomorph" {
  export interface IdiomorphCallbacks {
    beforeNodeAdded?: (node: Node) => boolean | void;
    afterNodeAdded?: (node: Node) => void;
    beforeNodeMorphed?: (oldNode: Node, newNode: Node) => boolean | void;
    afterNodeMorphed?: (oldNode: Node, newNode: Node) => void;
    beforeNodeRemoved?: (node: Node) => boolean | void;
    afterNodeRemoved?: (node: Node) => void;
    beforeAttributeUpdated?: (
      attributeName: string,
      node: Node,
      mutationType: "update" | "remove"
    ) => boolean | void;
  }

  export interface IdiomorphOptions {
    morphStyle?: "outerHTML" | "innerHTML";
    ignoreActive?: boolean;
    ignoreActiveValue?: boolean;
    restoreFocus?: boolean;
    callbacks?: IdiomorphCallbacks;
    head?: {
      style?: "merge" | "append" | "morph" | "none";
    };
  }

  export interface IdiomorphStatic {
    morph(
      oldNode: Element | Document,
      newContent: Element | Node | string,
      options?: IdiomorphOptions
    ): void;
    defaults: IdiomorphOptions;
  }

  export const Idiomorph: IdiomorphStatic;
}
