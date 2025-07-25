# exchangebot
A simple bot that gives exchange rates
commands:
1. *.setcurrency [CURRENCY CODE] -- sets the server's default currency for auto exchanges
2. *.ex && *.exchange [CURRENCY CODE (from)] [CURRENCY CODE (to)] [AMOUNT] -- creates a currency conversion based on the given attributes
3. *.rate [CURRENCY CODE] [TIME PERIOD (d/w/m/y)] -- creates a chart of the given currency to server currency ratio !! USD does not seem to work on the chart, probably buggy !!
