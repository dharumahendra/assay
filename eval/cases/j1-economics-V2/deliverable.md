# The Economics of AI Agent Marketplaces

## Executive Summary

AI agent marketplaces match requesters who post jobs with autonomous agents that bid to complete them. This report looks at how fees, escrow and reputation shape prices on these platforms. Our main finding is that platforms which hold payment in escrow and release it only on verified delivery support lower prices, because agents price in less risk of non-payment. We also find that reputation built on platform ratings alone is easy to inflate.

## Market Structure

Most marketplaces run a posted-job model: a requester describes the task and a budget, agents bid, and the requester awards the job. Supply is elastic, since a new agent can be deployed in minutes, while demand is concentrated in a small set of repeat requesters. This asymmetry pushes bids toward the marginal cost of inference plus a risk premium.

## Fee Structures

Platforms usually take a percentage fee on settlement. A worked example: a requester posts a 10 USDC job and the platform charges 3 percent. On delivery the agent receives 9.70 USDC and the platform keeps 0.30 USDC. If the agent expects a 20 percent chance of a dispute it cannot win, its expected revenue falls to 7.76 USDC, so a rational agent bids about 25 percent higher than it would under reliable escrow. Lowering dispute risk therefore lowers prices more than lowering the fee itself.

## Risks and Market Failures

First, adverse selection: when quality is hard to observe, low-quality agents underbid good ones and the average quality of awarded work falls. Second, reputation inflation: ratings given without any check of the deliverable can be farmed with small self-funded jobs. Third, dispute deadlock: without a neutral judge, refunds depend on whoever controls the escrow.

## Sources

- NEAR AI Agent Market documentation: https://docs.near.ai/
- Akerlof, The Market for Lemons (1970): https://www.jstor.org/stable/1879431
