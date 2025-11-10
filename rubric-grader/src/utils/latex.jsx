import { Fragment } from 'react';
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';

const latexPattern = /\$\$([\s\S]+?)\$\$/g;

const parseSegments = (text = '') => {
  const segments = [];
  if (typeof text !== 'string') {
    return segments;
  }

  let lastIndex = 0;
  let match;

  while ((match = latexPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    segments.push({
      type: 'latex',
      content: match[1],
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return segments;
};

export const renderTextWithLatex = (text, { inline = true } = {}) => {
  if (text === null || text === undefined) {
    return null;
  }

  const segments = parseSegments(text);
  if (segments.length === 0) {
    return text;
  }

  return segments.map((segment, index) => {
    if (segment.type === 'latex') {
      return inline ? (
        <InlineMath key={`latex-${index}`} math={segment.content} />
      ) : (
        <BlockMath key={`latex-${index}`} math={segment.content} />
      );
    }

    return (
      <Fragment key={`text-${index}`}>
        {segment.content}
      </Fragment>
    );
  });
};


