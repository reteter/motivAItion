const activeVerbPattern =
  /(?:zmieni(?:łem|łam|liśmy)|zaktualizowa(?:łem|łam|liśmy)|ustawi(?:łem|łam|liśmy)|doda(?:łem|łam|liśmy))/gi;
const stateTargetPattern = /(?:protocol|plan|trening|xp|histori)/i;
const passiveClaimPattern =
  /(?:protocol|plan|trening|xp|histori).{0,40}(?:został|została|zostało|zostały|jest).{0,20}(?:zmien|zaktualiz|ustaw|dod)/gi;

function isInDeniedReportingScope(sentence, claimIndex) {
  const prefix = sentence.slice(0, claimIndex);
  const contrastMarkers = [...prefix.matchAll(/\b(?:ale|jednak|natomiast)\b/gi)];
  const lastContrast = contrastMarkers.at(-1);
  const scope = prefix.slice(
    lastContrast ? (lastContrast.index ?? 0) + lastContrast[0].length : 0,
  );
  return (
    /\bnie\s+(?:mogę|możemy|mam|mamy)(?=\s|,)[^.!?;—]{0,160}\b(?:twierdzić|potwierdzić|powiedzieć)(?=\s|,)[^.!?;—]{0,120}$/i.test(scope) ||
    /\bnie\s+(?:twierdzę|twierdzimy|potwierdzam|potwierdzamy|mówię|mówimy)(?=\s|,)[^.!?;—]{0,120}$/i.test(scope)
  );
}

export function hasForbiddenStateClaim(text) {
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    const activeVerbs = [...sentence.matchAll(activeVerbPattern)];
    for (const [position, match] of activeVerbs.entries()) {
      const matchIndex = match.index ?? 0;
      const nextVerbIndex = activeVerbs[position + 1]?.index ?? sentence.length;
      const claim = sentence.slice(matchIndex, Math.min(nextVerbIndex, matchIndex + 60));
      if (!stateTargetPattern.test(claim)) continue;

      const prefix = sentence.slice(Math.max(0, matchIndex - 12), matchIndex);
      if (
        !/\b(?:nie|nigdy)\s*$/i.test(prefix) &&
        !isInDeniedReportingScope(sentence, matchIndex)
      ) return true;
    }
    for (const match of sentence.matchAll(passiveClaimPattern)) {
      if (
        !/\b(?:nie|nigdy)\s+(?:(?:został|została|zostało|zostały|jest)\s+)?(?:zmien|zaktualiz|ustaw|dod)/i.test(match[0]) &&
        !isInDeniedReportingScope(sentence, match.index ?? 0)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function citationsAreValid(text, citations, requiredHost) {
  if (!Array.isArray(citations) || citations.length === 0) return false;
  const hosts = [];
  const everyCitationIsValid = citations.every((citation) => {
    if (
      !Number.isInteger(citation.startIndex) ||
      !Number.isInteger(citation.endIndex) ||
      citation.startIndex < 0 ||
      citation.endIndex <= citation.startIndex ||
      citation.endIndex > text.length ||
      !text.slice(citation.startIndex, citation.endIndex).trim() ||
      typeof citation.title !== 'string' ||
      !citation.title.trim()
    ) return false;
    try {
      const url = new URL(citation.url);
      hosts.push(url.hostname);
      return url.protocol === 'https:';
    } catch {
      return false;
    }
  });
  return everyCitationIsValid &&
    (!requiredHost ||
      hosts.some((host) => host === requiredHost || host.endsWith(`.${requiredHost}`)));
}
