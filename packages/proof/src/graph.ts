import type { ChangeSession, TemporalProofGraph } from "@prof-bilal/atlas-core";

/** A projection of authoritative session state, NOT a second repository graph/store. */
export function projectProofGraph(session: ChangeSession): TemporalProofGraph {
  const nodes = new Map<string, TemporalProofGraph["nodes"][number]>();
  const edges: TemporalProofGraph["edges"][number][] = [];
  const add = (id: string, kind: TemporalProofGraph["nodes"][number]["kind"], version?: number) => {
    nodes.set(id, { id, kind, ...(version === undefined ? {} : { version }) });
  };
  const edge = (
    from: string,
    to: string,
    kind: TemporalProofGraph["edges"][number]["kind"],
    revision = session.current.id,
  ) => {
    edges.push({ from, to, kind, observedRevision: revision });
  };
  add(session.id, "Change", session.version);
  for (const revision of [session.baseline, session.current]) {
    add(revision.id, "RepositoryRevision");
    edge(session.id, revision.id, "observed_at", revision.id);
    for (const artifact of revision.artifacts) {
      add(artifact.id, "RepositoryArtifact");
      edge(artifact.id, revision.id, "observed_at", revision.id);
    }
  }
  for (const node of session.nodes) {
    add(node.id, node.kind, node.version);
    edge(node.id, session.id, "required_by");
    for (const dependency of node.dependsOn) edge(node.id, dependency, "depends_on");
    if (node.action) {
      const id = `action:${node.id}:${node.version}`;
      add(id, "VerificationAction");
      edge(id, node.id, "verifies");
    }
  }
  for (const evidence of session.evidence) {
    add(evidence.id, "Evidence");
    add(evidence.observedRevision, "RepositoryRevision");
    edge(evidence.id, evidence.observedRevision, "observed_at", evidence.observedRevision);
    if (
      evidence.status === "fresh" &&
      session.nodes.some((n) => n.id === evidence.nodeId && n.version === evidence.nodeVersion)
    ) {
      if (evidence.result === "pass" || evidence.result === "fail")
        edge(
          evidence.id,
          evidence.nodeId,
          evidence.result === "fail" ? "contradicts" : "supports",
          evidence.observedRevision,
        );
    }
    for (const artifact of evidence.sourceArtifactIds) {
      add(artifact, "RepositoryArtifact");
      edge(evidence.id, artifact, "derived_from", evidence.observedRevision);
    }
    if (evidence.status === "stale" && evidence.validUntilRevision) {
      add(evidence.validUntilRevision, "RepositoryRevision");
      edge(evidence.validUntilRevision, evidence.id, "invalidates", evidence.validUntilRevision);
    }
  }
  for (const item of session.justifications ?? [])
    for (const artifact of session.current.artifacts.filter((a) =>
      item.paths.some((p) => p === "." || a.path === p || a.path.startsWith(`${p}/`)),
    ))
      edge(item.nodeId, artifact.id, "authorizes");
  return {
    nodes: [...nodes.values()],
    edges: [...new Map(edges.map((e) => [JSON.stringify(e), e])).values()],
  };
}
