# Agent Frameworks Survey

## Methodology

We listed open-source frameworks for building LLM agents that had a public repository and a release in the last twelve months. For each one we recorded its repository.

## Frameworks

| # | Framework | Repository |
|---|---|---|
| 1 | LangGraph | https://github.com/langchain-ai/langgraph |
| 2 | AutoGen | https://github.com/microsoft/autogen |
| 3 | CrewAI | https://github.com/crewAIInc/crewAI |
| 4 | LlamaIndex | https://github.com/run-llama/llama_index |
| 5 | Semantic Kernel | https://github.com/microsoft/semantic-kernel |
| 6 | Haystack | https://github.com/deepset-ai/haystack |
| 7 | smolagents | https://github.com/huggingface/smolagents |
| 8 | Mastra | https://github.com/mastra-ai/mastra |
| 9 | Vercel AI SDK | https://github.com/vercel/ai |
| 10 | Pydantic AI | https://github.com/pydantic/pydantic-ai |
| 11 | DSPy | https://github.com/stanfordnlp/dspy |
| 12 | Agno | https://github.com/agno-agi/agno |

## Recommendation

For multi-step workflows with explicit state, LangGraph is the safest choice. Teams that want role-based multi-agent setups with little code should start with CrewAI. TypeScript teams building web products should pick Mastra or the Vercel AI SDK, and teams that want to optimise prompts automatically should look at DSPy.
