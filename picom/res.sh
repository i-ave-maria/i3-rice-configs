#!/bin/bash
xrandr --newmode "1920x1080_100.00" 297.00  1920 2080 2288 2656  1080 1083 1088 1146 -hsync +vsync
xrandr --addmode HDMI-1 1920x1080_100.00
xrandr --output HDMI-1 --mode 1920x1080_100.00


