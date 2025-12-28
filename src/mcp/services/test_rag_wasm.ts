
import { RAGService } from './rag';
import * as fs from 'fs';
import * as path from 'path';

async function testRAG() {
    console.log('--- Starting RAG Verification (WASM Backend) ---');
    const start = Date.now();
    const testDir = path.join(process.cwd(), 'temp_rag_test_wasm');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);

    const indexPath = path.join(testDir, 'embeddings.json');
    // Use default model (all-MiniLM-L6-v2)
    const rag = new RAGService(indexPath);

    console.log('1. Indexing sample content...');
    const file1 = path.join(testDir, 'doc1.md');
    fs.writeFileSync(file1, 'The quick brown fox jumps over the lazy dog. Authentication is handled by JWT.');
    
    const file2 = path.join(testDir, 'doc2.md');
    fs.writeFileSync(file2, 'Python is a great language for data science. RAG uses vector embeddings.');

    try {
        await rag.indexFile(file1, fs.readFileSync(file1, 'utf-8'));
        await rag.indexFile(file2, fs.readFileSync(file2, 'utf-8'));
        console.log('Indexing complete.');
    } catch (e) {
        console.error('Indexing failed:', e);
        return;
    }

    console.log('2. Searching for "authentication"...');
    const res1 = await rag.search('authentication');
    console.log('Results:', res1.map(r => ({ text: r.content, score: r.score })));

    console.log('--- Cleanup ---');
    fs.rmSync(testDir, { recursive: true, force: true });
    
    const end = Date.now();
    console.log(`--- Done in ${(end - start) / 1000}s ---`);
}

testRAG().catch(console.error);
