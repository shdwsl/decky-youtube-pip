import React from "react";
import { StateManager } from "cotton-box";
import { ModalRootProps } from "@decky/ui";

import { State, GlobalContext } from "./globalState";

export const modalWithState = <Props extends ModalRootProps>(Component: React.FC<Props>) => {
    return ({ value, ...props }: Props & { value: StateManager<State> }) =>
        <GlobalContext.Provider value={value}>
            <Component {...props as unknown as Props} />
        </GlobalContext.Provider>;
}
