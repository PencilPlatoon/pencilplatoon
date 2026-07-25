import * as React from "react";

/**
 * True when the primary pointing device is coarse (a finger). This gates the
 * on-screen touch controls: a mouse desktop shrunk to a narrow window keeps the
 * responsive menus but does NOT get the thumb pad, while phones and tablets do.
 * Width alone can't tell these apart.
 */
export function useHasTouch() {
  const [hasTouch, setHasTouch] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setHasTouch(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return hasTouch;
}
