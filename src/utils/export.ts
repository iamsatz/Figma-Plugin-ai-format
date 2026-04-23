// Export a Figma node as a 2× PNG base64 string.
// Keep scale at 2 per PRD; Gemini Flash accepts generous inline image sizes.
export async function nodeToPngBase64(node: SceneNode): Promise<string> {
  const bytes = await node.exportAsync({
    format: 'PNG',
    constraint: { type: 'SCALE', value: 2 },
  });
  return figma.base64Encode(bytes);
}
