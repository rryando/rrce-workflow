
import React from 'react';
import { Box, Text } from 'ink';
import { InstallWizard } from './components/InstallWizard';
import { detectWorkspaceRoot } from '../../lib/paths';

export const InstallView = () => {
    // We recreate the logic from runInstallWizard but as a component
    // Actually InstallModal was wrapping InstallWizard mostly.
    
    const workspacePath = detectWorkspaceRoot();

    return (
        <Box flexDirection="column" padding={1} borderStyle="round" borderColor="magenta">
            <Text bold color="magenta"> Installation & Configuration </Text>
             <Text color="dim"> Configure IDE integrations for VSCode, Claude, and Antigravity.</Text>
            <Box marginTop={1} flexDirection="column">
                <InstallWizard 
                    workspacePath={workspacePath}
                    onComplete={() => {}} 
                    onCancel={() => {}}
                />
            </Box>
        </Box>
    );
};
