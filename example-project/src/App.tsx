import React from 'react';
import { Button } from './components/Button';
import { formatText } from './utils/formatter';

export const App = () => {
  const title = formatText('My App');
  
  return (
    <div>
      <h1>{title}</h1>
      <Button text="Click me!" />
    </div>
  );
};