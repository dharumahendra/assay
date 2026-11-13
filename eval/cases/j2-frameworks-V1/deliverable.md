# Agent Frameworks Survey

## Methodology

We listed open-source frameworks for building LLM agents that had a public repository and a release in the last twelve months. For each one we recorded the primary language and the license from its repository.

## Frameworks

| # | Framework | Language | License | Repository |
|---|---|---|---|---|
| 1 | LangGraph | Python | MIT | https://github.com/langchain-ai/langgraph |
| 2 | AutoGen | Python | MIT | https://github.com/microsoft/autogen |
| 3 | CrewAI | Python | MIT | https://github.com/crewAIInc/crewAI |
| 4 | LlamaIndex | Python | MIT | https://github.com/run-llama/llama_index |
| 5 | Semantic Kernel | C# | MIT | https://github.com/microsoft/semantic-kernel |
| 6 | Haystack | Python | Apache-2.0 | https://github.com/deepset-ai/haystack |
| 7 | smolagents | Python | Apache-2.0 | https://github.com/huggingface/smolagents |
| 8 | Mastra | TypeScript | Apache-2.0 | https://github.com/mastra-ai/mastra |
| 9 | Vercel AI SDK | TypeScript | Apache-2.0 | https://github.com/vercel/ai |
| 10 | Pydantic AI | Python | MIT | https://github.com/pydantic/pydantic-ai |
| 11 | DSPy | Python | MIT | https://github.com/stanfordnlp/dspy |
| 12 | Agno | Python | MPL-2.0 | https://github.com/agno-agi/agno |

## Recommendation

For multi-step workflows with explicit state, LangGraph is the safest choice. Teams that want role-based multi-agent setups with little code should start with CrewAI. TypeScript teams building web products should pick Mastra or the Vercel AI SDK, and teams that want to optimise prompts automatically should look at DSPy.
