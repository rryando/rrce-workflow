#!/usr/bin/env bun
import * as React from 'react';
import { render } from 'ink';
import { App } from './App';

// Get command from args
const command = process.argv[2];

render(<App command={command} />);
