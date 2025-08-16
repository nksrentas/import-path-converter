import React from 'react';
import { formatText } from '../utils/formatter';
import { validateInput } from '../utils/validation';

export const Button = ({ text }: { text: string }) => {
  const formattedText = formatText(text);
  const isValid = validateInput(text);
  
  return (
    <button disabled={!isValid}>
      {formattedText}
    </button>
  );
};