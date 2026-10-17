#!/bin/bash
# Called by webhook; runs the deploy in the background and logs it.
nohup /srv/plot-planner/bin/deploy.sh >> /srv/plot-planner/deploy.log 2>&1 &
