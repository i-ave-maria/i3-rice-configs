#!/usr/bin/env sh

killall -q polybar &
sleep 0.2

polybar -c ~/.config/polybar/bspwm-2.ini bar1
