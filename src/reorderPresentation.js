// Shared by Today and Edit Plan: pointer motion stays out of React state.
export function moveReorderPreview(element, property, distance) {
  element?.style.setProperty(property, `${distance}px`);
}
